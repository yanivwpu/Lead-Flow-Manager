import { z } from "zod";

// Stable CRM identifiers. These are used by lead scoring, integrations and automations.
// Additional board columns have stable separate IDs and map to one of these CRM values.
export const PIPELINE_STAGE_IDS = ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Closed'] as const;
export type PipelineStageId = typeof PIPELINE_STAGE_IDS[number];

const customIdSchema = z.string().regex(/^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const isCustomPipelineStageId = (value: string): boolean => customIdSchema.safeParse(value).success;
const stageLayoutSchema = z.object({
  id: z.union([z.enum(PIPELINE_STAGE_IDS), customIdSchema]),
  canonicalStage: z.enum(PIPELINE_STAGE_IDS).optional(),
  label: z.string().trim().min(1).max(60).refine(value => !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)),
}).strict();

export const MAX_PIPELINE_COLUMNS = 15;
export const pipelineLayoutSchema = z.array(stageLayoutSchema).min(PIPELINE_STAGE_IDS.length).max(MAX_PIPELINE_COLUMNS).superRefine((stages, ctx) => {
  const ids = new Set(stages.map(stage => stage.id));
  if (ids.size !== stages.length || !PIPELINE_STAGE_IDS.every(id => ids.has(id))) {
    ctx.addIssue({ code: 'custom', message: 'Every stable stage must occur exactly once' });
  }
  if (stages.some(stage => isCustomPipelineStageId(stage.id) !== Boolean(stage.canonicalStage))) {
    ctx.addIssue({ code: "custom", message: "Custom columns require a standard CRM stage; standard columns cannot be remapped" });
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

export const pipelineLayoutMoveSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  revision: z.number().int().min(1).max(2147483646),
  columnId: customIdSchema,
}).strict();
export type PipelineLayoutMove = z.infer<typeof pipelineLayoutMoveSchema>;

/** Existing IDs cannot be remapped. Every added stage gets a fresh server ID,
 * including attempts to reuse deleted IDs. Stale assignments therefore cannot revive. */
export function preparePipelineLayoutSave(draft: readonly PipelineStageLayout[], current: readonly PipelineStageLayout[], newId: () => string): PipelineStageLayout[] | null {
  const result: PipelineStageLayout[] = [];
  for (const stage of draft) {
    if (!isCustomPipelineStageId(stage.id)) { result.push(stage); continue; }
    const existing = current.find(item => item.id === stage.id);
    if (existing && existing.canonicalStage !== stage.canonicalStage) return null;
    result.push(existing ? stage : { ...stage, id: newId() });
  }
  const parsed = pipelineLayoutSchema.safeParse(result);
  return parsed.success ? parsed.data : null;
}

export function customPipelineColumn(layout: readonly PipelineStageLayout[], canonicalStage: string, customId?: string | null): string | undefined {
  return layout.find(stage => stage.id === customId && stage.canonicalStage === canonicalStage)?.id;
}
