import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProspectMessageCreationSettings } from "@shared/prospectMessageCreation";
import type { ProspectIntelligenceListItem } from "@shared/prospectImport";
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

const SAMPLE_VALUE = "__sample__";
const MANUAL_VALUE = "__manual__";

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
        ? `Sample merge only — ${aiKeys.length} AI personalization section(s) still need a live prospect fill.`
        : "Sample prospect: Alex Rivera / Rivera Realty.",
  };
}

function prospectLabel(item: ProspectIntelligenceListItem): string {
  const name = String(item.name || "").trim();
  const company = String(item.company || "").trim();
  if (name && company && company.toLowerCase() !== name.toLowerCase()) {
    return `${name} · ${company}`;
  }
  return name || company || item.contactId.slice(0, 8);
}

export function ProspectMessagePreview({ draft, contactId }: Props) {
  const [selection, setSelection] = useState<string>(contactId || SAMPLE_VALUE);
  const [manualContactId, setManualContactId] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [localNote, setLocalNote] = useState<string | null>(null);

  useEffect(() => {
    if (contactId) setSelection(contactId);
  }, [contactId]);

  const recentProspectsQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence", "message-preview-qualified"],
    queryFn: async () => {
      const params = new URLSearchParams({
        statusFilter: "approved",
        sortBy: "createdAt",
        sortDir: "desc",
        limit: "20",
        lifecycle: "active",
      });
      const res = await fetch(`/api/growth-tools/prospect-intelligence?${params.toString()}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load prospects");
      return (data.items || []) as ProspectIntelligenceListItem[];
    },
    staleTime: 60_000,
  });

  const recentProspects = recentProspectsQuery.data || [];

  const resolveContactId = (): string => {
    if (selection === SAMPLE_VALUE) return "";
    if (selection === MANUAL_VALUE) return String(manualContactId || "").trim();
    return String(selection || "").trim();
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const id = resolveContactId();
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
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label htmlFor="pi-preview-prospect" className="text-xs">
            Preview using
          </Label>
          <Select value={selection} onValueChange={setSelection}>
            <SelectTrigger id="pi-preview-prospect" className="h-8 text-xs" data-testid="pi-preview-prospect">
              <SelectValue placeholder="Select a prospect..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SAMPLE_VALUE}>Sample prospect (Alex Rivera)</SelectItem>
              {recentProspects.map((item) => (
                <SelectItem key={item.contactId} value={item.contactId}>
                  {prospectLabel(item)}
                </SelectItem>
              ))}
              <SelectItem value={MANUAL_VALUE}>Lookup by contact ID…</SelectItem>
            </SelectContent>
          </Select>
          {recentProspectsQuery.isError ? (
            <p className="text-[11px] text-gray-500">
              Could not load recent qualified prospects — use sample or manual lookup.
            </p>
          ) : recentProspects.length === 0 && !recentProspectsQuery.isLoading ? (
            <p className="text-[11px] text-gray-500">
              No recent qualified prospects yet — preview with the sample, or look up by ID.
            </p>
          ) : (
            <p className="text-[11px] text-gray-500">
              Choose a recent qualified prospect, or look up by ID.
            </p>
          )}
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
          {previewMutation.isPending ? "Previewing…" : "Preview Message"}
        </Button>
      </div>

      {selection === MANUAL_VALUE ? (
        <div className="space-y-1">
          <Label htmlFor="pi-preview-contact" className="text-xs">
            Contact ID
          </Label>
          <Input
            id="pi-preview-contact"
            value={manualContactId}
            onChange={(e) => setManualContactId(e.target.value)}
            placeholder="Paste a prospect contact ID"
            className="h-8 text-xs"
            data-testid="pi-preview-contact-id"
          />
        </div>
      ) : null}

      {previewMutation.isError ? (
        <p className="text-xs text-red-600">
          {(previewMutation.error as Error)?.message || "Preview failed"}
        </p>
      ) : null}

      {preview ? (
        <div
          className="space-y-1.5 rounded-md border border-gray-200 bg-white p-3"
          data-testid="pi-preview-result"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Final rendered email
          </p>
          <p className="text-[11px] text-gray-500">
            {preview.prospectName || "Prospect"}
            {localNote ? ` · ${localNote}` : null}
          </p>
          <p className="text-sm font-medium text-gray-900" data-testid="pi-preview-subject">
            Subject: {preview.subject || "(no subject)"}
          </p>
          <pre
            className="whitespace-pre-wrap rounded border border-gray-100 bg-gray-50/80 p-2.5 text-[13px] leading-relaxed text-gray-800"
            data-testid="pi-preview-body"
          >
            {preview.body || "(empty message)"}
          </pre>
          {preview.unresolvedTokens.length > 0 ? (
            <p className="text-[11px] text-amber-700">
              Still needs fill: {preview.unresolvedTokens.map((t) => `{{${t}}}`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">
          Preview shows the final rendered email for the selected prospect.
        </p>
      )}
    </div>
  );
}
