import { z } from "zod";

// Stable CRM identifiers. These are used by lead scoring, integrations and automations.
// Display labels and column order are presentation settings, never new CRM stage values.
export const PIPELINE_STAGE_IDS = ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Closed'] as const;
export type PipelineStageId = typeof PIPELINE_STAGE_IDS[number];

const stageLayoutSchema = z.object({
  id: z.enum(PIPELINE_STAGE_IDS),
  label: z.string().trim().min(1).max(60).refine(value => !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)),
}).strict();

export const pipelineLayoutSchema = z.array(stageLayoutSchema).length(PIPELINE_STAGE_IDS.length).superRefine((stages, ctx) => {
  if (new Set(stages.map(stage => stage.id)).size !== PIPELINE_STAGE_IDS.length) {
    ctx.addIssue({ code: 'custom', message: 'Every stable stage must occur exactly once' });
  }
  if (new Set(stages.map(stage => stage.label.normalize('NFKC').toLowerCase())).size !== stages.length) {
    ctx.addIssue({ code: 'custom', message: 'Stage labels must be unique' });
  }
});
export type PipelineStageLayout = z.infer<typeof stageLayoutSchema>;
export const pipelineLayoutPatchSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  revision: z.number().int().min(0).max(2147483646),
  stages: pipelineLayoutSchema,
}).strict();
export type PipelineLayoutResponse = {
  workspaceId: string;
  canEdit: boolean;
  /** Present only for authorized editors; never persisted in workspace settings. */
  csrfToken?: string;
  revision: number;
  stages: PipelineStageLayout[];
};

export function defaultPipelineLayout(): PipelineStageLayout[] {
  return PIPELINE_STAGE_IDS.map(id => ({ id, label: id }));
}

/** Preserve dynamic/legacy stages after the five configured columns, without inventing any. */
export function orderedPipelineStages(layout: readonly PipelineStageLayout[], observed: readonly string[]): string[] {
  return [...new Set<string>([...layout.map(stage => stage.id), ...observed])];
}

export function pipelineStageDisplayLabel(layout: readonly PipelineStageLayout[], id: string): string {
  return layout.find(stage => stage.id === id)?.label ?? id;
}
