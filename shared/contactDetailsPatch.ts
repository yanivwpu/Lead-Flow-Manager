import { z } from 'zod';
/** Strict allowlist for the details editor; never accepts synchronized JSON or ownership fields. */
export const contactDetailsPatchSchema = z.object({
  expectedUpdatedAt: z.string().datetime().nullable(),
  name: z.string().trim().min(1).max(250).optional(),
  email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  tag: z.string().trim().max(100).optional(),
  pipelineStage: z.string().trim().min(1).max(100).optional(),
  assignedTo: z.string().min(1).nullable().optional(),
  followUp: z.string().trim().max(1000).nullable().optional(),
  followUpDate: z.string().datetime().nullable().optional(),
}).strict();
