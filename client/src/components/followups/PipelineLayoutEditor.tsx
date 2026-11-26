import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { defaultPipelineLayout, pipelineLayoutSchema, isCustomPipelineStageId, MAX_PIPELINE_COLUMNS, PIPELINE_STAGE_IDS, type PipelineStageId, type PipelineLayoutResponse, type PipelineStageLayout } from "@shared/pipelineLayout";

export function PipelineLayoutEditor({ layout, onClose, onSaved, onConflict }: {
  layout: PipelineLayoutResponse;
  onClose: () => void;
  onSaved: (response: PipelineLayoutResponse) => void;
  onConflict: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  // Snapshot the exact workspace and revision displayed when editing began.
  const [original] = useState(layout);
  const [draft, setDraft] = useState<PipelineStageLayout[]>(() => layout.stages.map(stage => ({ ...stage })));
  const [conflict, setConflict] = useState(false);
  const parsed = pipelineLayoutSchema.safeParse(draft);
  const save = useMutation({
    mutationFn: async (stages: PipelineStageLayout[]) => {
      if (!original.csrfToken) throw new Error("conflict");
      const response = await fetch("/api/inbox/pipeline-layout", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": original.csrfToken },
        body: JSON.stringify({ workspaceId: original.workspaceId, revision: original.revision, stages }),
      });
      if (response.status === 409 || response.status === 403) throw new Error("conflict");
      if (!response.ok) throw new Error("save");
      const value = await response.json() as PipelineLayoutResponse;
      if (value.workspaceId !== original.workspaceId) throw new Error("conflict");
      return value;
    },
    onSuccess: value => { onSaved(value); toast({ title: t("followups.layoutSaved") }); onClose(); },
    onError: (error: Error) => {
      if (error.message === "conflict") { setConflict(true); onConflict(); }
      else toast({ title: t("followups.layoutSaveFailed"), variant: "destructive" });
    },
  });
  const move = (index: number, direction: -1 | 1) => {
    setDraft(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  return (
    <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogTitle>{t("followups.customizePipeline")}</DialogTitle>
        <DialogDescription>{t("followups.layoutDescription")}</DialogDescription>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (parsed.success && !conflict && !save.isPending) save.mutate(parsed.data); }}>
          <div className="space-y-2">
            {draft.map((stage, index) => (
              <div key={stage.id} className="rounded-lg border border-slate-200 p-2.5 flex items-end gap-2">
                <label className="flex-1 min-w-0 grid gap-1 text-xs text-slate-600">
                  <span>{t("followups.internalStage", { stage: stage.canonicalStage ?? stage.id })}</span>
                  <input value={stage.label} maxLength={60} required disabled={save.isPending || conflict} className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-900" onChange={event => setDraft(prev => prev.map(item => item.id === stage.id ? { ...item, label: event.target.value } : item))} data-testid={`pipeline-layout-label-${stage.id.toLowerCase()}`} />
                  {isCustomPipelineStageId(stage.id) && <select className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" aria-label={t("followups.customStageMapping")} value={stage.canonicalStage} disabled={save.isPending || conflict || original.stages.some(item => item.id === stage.id)} onChange={event => setDraft(prev => prev.map(item => item.id === stage.id ? { ...item, canonicalStage: event.target.value as PipelineStageId } : item))}>{PIPELINE_STAGE_IDS.map(id => <option key={id} value={id}>{id}</option>)}</select>}
                </label>
                {isCustomPipelineStageId(stage.id) && <Button type="button" variant="ghost" size="sm" disabled={save.isPending || conflict} onClick={() => setDraft(prev => prev.filter(item => item.id !== stage.id))}>{t("followups.removeCustomStage")}</Button>}
                <Button type="button" variant="outline" size="icon" disabled={index === 0 || save.isPending || conflict} aria-label={t("followups.moveStageEarlier", { stage: stage.label })} onClick={() => move(index, -1)}><ChevronUp className="h-4 w-4" /></Button>
                <Button type="button" variant="outline" size="icon" disabled={index === draft.length - 1 || save.isPending || conflict} aria-label={t("followups.moveStageLater", { stage: stage.label })} onClick={() => move(index, 1)}><ChevronDown className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" disabled={draft.length >= MAX_PIPELINE_COLUMNS || save.isPending || conflict} onClick={() => setDraft(prev => [...prev, { id: `custom:${crypto.randomUUID()}`, label: "", canonicalStage: "Proposal" }])}>{t("followups.addCustomStage")}</Button>
          <p className="text-xs text-slate-600">{t("followups.customStageRemovalHint")}</p>
          {!parsed.success && <p role="alert" className="text-sm text-red-700">{t("followups.layoutInvalid")}</p>}
          {conflict && <p role="alert" className="text-sm text-amber-800">{t("followups.layoutConflict")}</p>}
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button type="button" variant="ghost" disabled={save.isPending || conflict} onClick={() => setDraft(defaultPipelineLayout())}>{t("followups.resetLayout")}</Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={!parsed.success || save.isPending || conflict}>{save.isPending ? t("common.loading") : t("common.save")}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
