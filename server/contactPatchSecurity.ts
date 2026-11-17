import { z } from "zod";
import { insertContactSchema } from "@shared/schema";

// Browser CRM edits only. Ownership, immutable provider identities, source/provenance,
// timestamps and server-recorded actors cannot be written through this endpoint.
export const contactPatchSchema = insertContactSchema.pick({
  name: true, email: true, phone: true, avatar: true, tag: true, pipelineStage: true,
  notes: true, followUp: true, followUpDate: true, assignedTo: true,
  customFields: true, primaryChannelOverride: true, automationsPaused: true,
  leadScore: true,
}).partial().extend({
  followUpDate: z.union([z.string().datetime({ offset: true }), z.date()]).nullable().optional(),
}).strict();
