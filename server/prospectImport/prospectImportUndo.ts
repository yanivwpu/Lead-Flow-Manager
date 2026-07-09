import { eq } from "drizzle-orm";
import type { Contact } from "@shared/schema";
import { conversations, messages, prospectImportJobs } from "@shared/schema";
import type {
  ProspectImportPipelineStage,
  ProspectImportUndoPreview,
} from "@shared/prospectImport";
import { db } from "../../drizzle/db";
import { storage } from "../storage";

const BLOCKED_STAGES = new Set<ProspectImportPipelineStage>(["Customer", "Partner"]);

type ProspectImportMeta = {
  importJobId?: string;
  createdByImportJob?: boolean;
};

function readProspectImportMeta(contact: Contact): ProspectImportMeta | null {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const fromSource = sd.prospectImport as ProspectImportMeta | undefined;
  if (fromSource?.importJobId) return fromSource;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const fromCustom = cf.prospectImport as ProspectImportMeta | undefined;
  return fromCustom?.importJobId ? fromCustom : null;
}

export function getContactsCreatedByImportJob(allContacts: Contact[], jobId: string): Contact[] {
  return allContacts.filter((c) => {
    const meta = readProspectImportMeta(c);
    if (!meta || meta.importJobId !== jobId) return false;
    if (meta.createdByImportJob === false) return false;
    if (meta.createdByImportJob === true) return true;
    return c.source === "import";
  });
}

async function contactHasMessages(contactId: string): Promise<boolean> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.contactId, contactId))
    .limit(1);
  return rows.length > 0;
}

export function evaluateContactUndoEligibility(
  contact: Contact,
  hasMessages: boolean,
): { canDelete: boolean; reason?: string } {
  const stage = (contact.pipelineStage || "Imported") as ProspectImportPipelineStage;
  if (BLOCKED_STAGES.has(stage)) {
    return { canDelete: false, reason: `Converted to ${stage}` };
  }
  if (stage !== "Imported") {
    return { canDelete: false, reason: `Pipeline stage is ${stage}` };
  }
  if (hasMessages) {
    return { canDelete: false, reason: "Has conversations with messages" };
  }
  return { canDelete: true };
}

export async function classifyUndoCandidates(
  destinationUserId: string,
  jobId: string,
): Promise<{
  deletable: Contact[];
  blocked: { contact: Contact; reason: string }[];
}> {
  const allContacts = await storage.getContacts(destinationUserId, 50000);
  const candidates = getContactsCreatedByImportJob(allContacts, jobId);

  const deletable: Contact[] = [];
  const blocked: { contact: Contact; reason: string }[] = [];

  for (const contact of candidates) {
    const eligibility = evaluateContactUndoEligibility(
      contact,
      await contactHasMessages(contact.id),
    );
    if (!eligibility.canDelete) {
      blocked.push({ contact, reason: eligibility.reason ?? "Blocked" });
      continue;
    }
    deletable.push(contact);
  }

  return { deletable, blocked };
}

export async function previewProspectImportUndo(jobId: string): Promise<ProspectImportUndoPreview | null> {
  const rows = await db.select().from(prospectImportJobs).where(eq(prospectImportJobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) return null;

  const { deletable, blocked } = await classifyUndoCandidates(job.destinationUserId, jobId);

  const reasonCounts = new Map<string, number>();
  for (const b of blocked) {
    reasonCounts.set(b.reason, (reasonCounts.get(b.reason) ?? 0) + 1);
  }

  return {
    jobId,
    deletableCount: deletable.length,
    blockedCount: blocked.length,
    blockedReasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })),
  };
}

export async function executeProspectImportUndo(params: {
  jobId: string;
  undoneByUserId: string;
}): Promise<{ deleted: number; blocked: number; undoStatus: "partial" | "undone" }> {
  const rows = await db.select().from(prospectImportJobs).where(eq(prospectImportJobs.id, params.jobId)).limit(1);
  const job = rows[0];
  if (!job) throw new Error("Import job not found");
  if (job.undoStatus === "undone") throw new Error("This import batch was already undone");

  const { deletable, blocked } = await classifyUndoCandidates(job.destinationUserId, params.jobId);

  for (const contact of deletable) {
    await storage.deleteContact(contact.id);
  }

  const undoStatus = resolveUndoJobStatus(blocked.length);
  await db
    .update(prospectImportJobs)
    .set({
      undoStatus,
      undoneAt: new Date(),
      undoneByUserId: params.undoneByUserId,
    })
    .where(eq(prospectImportJobs.id, params.jobId));

  return { deleted: deletable.length, blocked: blocked.length, undoStatus };
}

export function resolveUndoJobStatus(blockedCount: number): "partial" | "undone" {
  return blockedCount > 0 ? "partial" : "undone";
}

export async function canUndoImportJob(job: typeof prospectImportJobs.$inferSelect): Promise<{
  canUndo: boolean;
  reason?: string;
}> {
  if (job.status !== "completed") return { canUndo: false, reason: "Import not completed" };
  if (job.undoStatus === "undone") return { canUndo: false, reason: "Already undone" };
  if ((job.resultImported ?? 0) === 0) return { canUndo: false, reason: "No contacts were imported" };

  const preview = await previewProspectImportUndo(job.id);
  if (!preview) return { canUndo: false, reason: "Job not found" };
  if (preview.deletableCount === 0) {
    return { canUndo: false, reason: "No deletable contacts remain from this batch" };
  }
  return { canUndo: true };
}
